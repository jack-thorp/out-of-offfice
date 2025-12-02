import flask,sqlite3,json

app = flask.Flask(__name__)

DB = "OOODB.db"

def execute(sql, params=()):
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    rows = cur.fetchall()
    headers = [desc[0] for desc in cur.description]
    conn.close()
    return headers,rows



@app.route("/hardReset")
def hardReset():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("delete from r5entries;")

    conn.commit()
    conn.close()

    return "deleted"

@app.route("/addEntry", methods=["POST"])
def addEntry():
    data = flask.request.get_json()
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO r5entries(ent_userid, ent_details, ent_location, ent_rating, ent_vibe,ent_address,ent_lat,ent_long)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        data["ent_userid"],
        data["ent_details"],
        data["ent_location"],
        data["ent_rating"],
        data["ent_vibe"],
        data["ent_address"], data["ent_lat"], data["ent_long"]
    ))

    pk = cur.lastrowid
    conn.commit()
    conn.close()

    return flask.jsonify({"status": "ok", "pk": pk})


@app.route("/getEntries")
def getEntries():
    headers, rows = execute('select * from r5entries')
    entries = [dict(zip(headers, r)) for r in rows]
    return json.dumps(entries)

@app.route("/")
def root():

    return flask.render_template(
        'landingPage.html'
    )


if __name__ == '__main__':
    app.run(debug=True)