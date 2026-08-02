"""Home Payment Advisor — Flask app for comparing mortgage payment scenarios.

Replicates the logic of "Payment Calculator - Stuart.xlsx" with live sliders,
customizable scenarios, Zillow listing import, and a printable client report.
"""
import hashlib
import json
import os
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, redirect, render_template, request, session, url_for

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, "data")
SAVES_FILE = os.path.join(DATA_DIR, "saves.json")
_saves_lock = threading.Lock()

app = Flask(__name__)

# Opt-in password gate: unset SITE_PASSWORD (the local/Docker default) and the
# app behaves exactly as before — no auth, localhost-only. Set it (as on a
# public host) and every route below requires a login first.
SITE_PASSWORD = os.environ.get("SITE_PASSWORD", "")

# Session-signing key. Gunicorn runs multiple worker processes, so a randomly
# generated key would differ per worker and invalidate sessions signed by a
# different one on the next request. When the gate is on, derive the key from
# SITE_PASSWORD so every worker computes the same one with no extra config;
# an explicit SECRET_KEY env var always wins if set.
app.secret_key = (
    os.environ.get("SECRET_KEY")
    or (hashlib.sha256(f"hpa-session-{SITE_PASSWORD}".encode()).hexdigest() if SITE_PASSWORD else secrets.token_hex(32))
)
app.permanent_session_lifetime = timedelta(days=30)


@app.before_request
def require_login():
    if not SITE_PASSWORD:
        return
    # /import must stay reachable unauthenticated: the bookmarklet opens it
    # with the listing data in the URL fragment, which a server-side redirect
    # to /login would silently drop (fragments never reach the server).
    if request.path in ("/login", "/logout", "/import") or request.path.startswith("/static/"):
        return
    if session.get("authed"):
        return
    if request.path.startswith("/api/"):
        return jsonify({"error": "Session expired — refresh and log in again."}), 401
    return redirect(url_for("login", next=request.path))


@app.route("/login", methods=["GET", "POST"])
def login():
    if not SITE_PASSWORD:
        return redirect(url_for("index"))
    error = None
    next_url = request.values.get("next", "")
    if request.method == "POST":
        if secrets.compare_digest(request.form.get("password", ""), SITE_PASSWORD):
            session.clear()
            session["authed"] = True
            session.permanent = True
            return redirect(next_url if next_url.startswith("/") else url_for("index"))
        error = "Incorrect password."
    return render_template("login.html", error=error, next=next_url)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ---------------------------------------------------------------- saves store
def _read_saves():
    if not os.path.exists(SAVES_FILE):
        return {}
    try:
        with open(SAVES_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _write_saves(saves):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = SAVES_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(saves, f, indent=2)
    os.replace(tmp, SAVES_FILE)


@app.route("/")
def index():
    return render_template("index.html", auth_enabled=bool(SITE_PASSWORD))


@app.route("/report")
def report():
    return render_template("report.html")


@app.route("/homes")
def homes_summary():
    """Printable at-a-glance summary of every imported home, 6 per page."""
    return render_template("homes.html")


@app.route("/import")
def import_listing():
    """Landing page for the bookmarklet: listing data arrives in the URL
    fragment, gets stashed in localStorage, and the page hands off to the app."""
    return render_template("import.html")


@app.get("/api/saves")
def list_saves():
    with _saves_lock:
        saves = _read_saves()
    items = [
        {"name": name, "savedAt": entry.get("savedAt")}
        for name, entry in saves.items()
    ]
    items.sort(key=lambda x: x.get("savedAt") or "", reverse=True)
    return jsonify(items)


@app.post("/api/saves")
def create_save():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    state = body.get("state")
    if not name or not isinstance(state, dict):
        return jsonify({"error": "A name and scenario state are required."}), 400
    with _saves_lock:
        saves = _read_saves()
        saves[name] = {
            "savedAt": datetime.now(timezone.utc).isoformat(),
            "state": state,
        }
        _write_saves(saves)
    return jsonify({"ok": True, "name": name})


@app.get("/api/saves/<path:name>")
def get_save(name):
    with _saves_lock:
        saves = _read_saves()
    entry = saves.get(name)
    if not entry:
        return jsonify({"error": "Not found"}), 404
    return jsonify(entry)


@app.delete("/api/saves/<path:name>")
def delete_save(name):
    with _saves_lock:
        saves = _read_saves()
        if name not in saves:
            return jsonify({"error": "Not found"}), 404
        del saves[name]
        _write_saves(saves)
    return jsonify({"ok": True})


# ------------------------------------------------------------- zillow import
FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _deep_find(obj, key):
    """Depth-first search for the first non-null value of `key` in nested JSON."""
    stack = [obj]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            if key in node and node[key] not in (None, "", 0):
                return node[key]
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    return None


def _regex_num(pattern, text):
    m = re.search(pattern, text)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _parse_listing(html):
    """Best-effort extraction of listing facts from a Zillow detail page."""
    data = {}
    blobs = []
    for m in re.finditer(
        r'<script[^>]+(?:id="__NEXT_DATA__"|type="application/json")[^>]*>(.*?)</script>',
        html,
        re.DOTALL,
    ):
        try:
            blobs.append(json.loads(m.group(1)))
        except json.JSONDecodeError:
            # Zillow sometimes double-encodes the apollo cache as a JSON string
            try:
                blobs.append(json.loads(json.loads(m.group(1))))
            except (json.JSONDecodeError, TypeError):
                continue

    def find(key):
        for blob in blobs:
            val = _deep_find(blob, key)
            if val is not None:
                return val
        return None

    price = find("price")
    if isinstance(price, dict):
        price = price.get("value")
    data["price"] = price if isinstance(price, (int, float)) else None

    street = find("streetAddress")
    city = find("city")
    st = find("state")
    zipcode = find("zipcode")
    if street and city:
        data["address"] = f"{street}, {city}, {st or ''} {zipcode or ''}".strip()

    # Taxes: most recent year of the tax history first, then the summary
    # amount, then rate x price.
    tax_hist = find("taxHistory")
    if isinstance(tax_hist, list):
        best = None
        for entry in tax_hist:
            if isinstance(entry, dict) and entry.get("taxPaid"):
                if best is None or (entry.get("time") or 0) > (best.get("time") or 0):
                    best = entry
        if best:
            data["annualTaxes"] = round(best["taxPaid"])
    if not data.get("annualTaxes"):
        tax_rate = find("propertyTaxRate")  # percent, e.g. 0.46
        tax_amount = find("taxAnnualAmount")
        if isinstance(tax_amount, (int, float)) and tax_amount > 0:
            data["annualTaxes"] = round(tax_amount)
        elif (
            isinstance(tax_rate, (int, float))
            and tax_rate > 0
            and data.get("price")
        ):
            data["annualTaxes"] = round(data["price"] * tax_rate / 100)

    hoa = find("monthlyHoaFee") or find("hoaFee")
    if isinstance(hoa, dict):
        hoa = hoa.get("amount")
    # Missing HOA on a listing means no HOA — send 0 so a previous house's
    # dues don't linger in the calculator.
    data["hoaMonthly"] = round(hoa) if isinstance(hoa, (int, float)) else 0

    ins = find("annualHomeownersInsurance")
    if isinstance(ins, (int, float)) and ins > 0:
        data["insMonthly"] = round(ins / 12)

    for key in ("bedrooms", "bathrooms", "livingArea", "yearBuilt", "zestimate"):
        val = find(key)
        if isinstance(val, (int, float)):
            data[key] = val

    # Regex fallbacks when the JSON blobs are missing or partial
    if not data.get("price"):
        data["price"] = _regex_num(r'"price"\s*:\s*(\d{5,9})', html)
    if not data.get("annualTaxes"):
        amt = _regex_num(r'"taxAnnualAmount"\s*:\s*(\d{3,7})', html)
        if amt:
            data["annualTaxes"] = round(amt)
        else:
            rate = _regex_num(r'"propertyTaxRate"\s*:\s*([\d.]+)', html)
            if rate and data.get("price"):
                data["annualTaxes"] = round(data["price"] * rate / 100)
    if data.get("insMonthly") is None:
        ins = _regex_num(r'"annualHomeownersInsurance"\s*:\s*(\d{3,6})', html)
        if ins:
            data["insMonthly"] = round(ins / 12)
    if not data.get("address"):
        m = re.search(r'<meta property="og:title" content="([^"|]+)', html)
        if m:
            data["address"] = m.group(1).strip()

    m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    if m:
        data["photo"] = m.group(1)

    return {k: v for k, v in data.items() if v is not None}


@app.post("/api/zillow")
def zillow_import():
    body = request.get_json(silent=True) or {}
    url = (body.get("url") or "").strip()
    host = urlparse(url).netloc.lower()
    if not url.startswith("http") or not (
        host == "zillow.com" or host.endswith(".zillow.com")
    ):
        return jsonify({"error": "Please paste a full Zillow listing URL (zillow.com/homedetails/…)."}), 400

    try:
        resp = requests.get(url, headers=FETCH_HEADERS, timeout=15)
    except requests.RequestException as exc:
        return jsonify({"error": f"Could not reach Zillow: {exc}"}), 502

    if resp.status_code != 200 or "captcha" in resp.text[:4000].lower():
        return (
            jsonify(
                {
                    "error": (
                        "Zillow blocked the automated request (this happens often — "
                        "they use bot protection). Use the manual fields below to "
                        "copy the numbers from the listing."
                    )
                }
            ),
            502,
        )

    data = _parse_listing(resp.text)
    if not data.get("price"):
        return (
            jsonify(
                {
                    "error": (
                        "Couldn't find listing details on that page. Make sure it's a "
                        "property detail URL (zillow.com/homedetails/…), or enter the "
                        "numbers manually below."
                    )
                }
            ),
            422,
        )
    data["url"] = url
    return jsonify({"ok": True, "data": data})


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "7896"))
    print(f"Home Payment Advisor starting on http://{host}:{port}")
    app.run(host=host, port=port, debug=False)
