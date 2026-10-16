export function stateDouble() {
  const rows = new Map();
  return (url, options) => {
    if (new URL(url).hostname !== "state.test") return null;
    const { action, key, version, value } = JSON.parse(options.body);
    const row = rows.get(key) || { version: 0, value: null };
    if (action === "get") return Response.json(row);
    if (version !== row.version) return Response.json({ error: "conflict" }, { status: 409 });
    const next = { version: version + 1, value: structuredClone(value) };
    rows.set(key, next);
    return Response.json(next);
  };
}
