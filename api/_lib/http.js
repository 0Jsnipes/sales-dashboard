export function setJsonHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

export function handleOptions(req, res) {
  setJsonHeaders(res);
  res.status(204).end();
}

export function sendJson(res, status, payload) {
  setJsonHeaders(res);
  res.status(status).send(JSON.stringify(payload));
}
