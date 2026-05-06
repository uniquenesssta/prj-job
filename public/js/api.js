async function api(url, options = {}) {
  const init = { method: options.method || "GET", headers: options.headers || {} };
  if (options.body && !(options.body instanceof FormData)) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  } else if (options.body) {
    init.body = options.body;
  }
  const response = await fetch(url, init);
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
