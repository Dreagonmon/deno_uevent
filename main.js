import { startListen, pingListener, emitEvent, startKeepliveTask } from "./listeners.js";

const PORT = 18969;
const FIELD_CONTENT_MAX_LENGTH = 16384;

await Deno.permissions.request({ name: "net", host: `0.0.0.0:${PORT}` });
await Deno.permissions.request({ name: "read", path: "./index.html" });

const response = (code = 200, data = null) => {
    if (typeof (data) !== "string") {
        switch (code) {
            case 200: data = "Ok"; break;
            case 400: data = "Bad Request"; break;
            case 404: data = "Not Found"; break;
            case 409: data = "Conflict"; break;
            default: data = ""; break;
        }
    }
    return new Response(
        JSON.stringify({ code, data }),
        {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "text/plain",
            }
        }
    );
};

/** handler
 * @type {Deno.ServeHandler} 
 */
const handler = async (req, _) => {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method.toUpperCase() === "POST") {
        // const body = await req.json();
        if (path.startsWith("/ping/")) {
            const uid = path.substring("/listen/".length);
            if (pingListener(uid)) {
                return response(200);
            }
        } else if (path.startsWith("/emit/")) {
            const uidAndEvent = path.substring("/emit/".length);
            let uid = uidAndEvent;
            let event = undefined;
            const pos = uidAndEvent.indexOf("/");
            if (pos > 0) {
                uid = uidAndEvent.substring(0, pos);
                event = uidAndEvent.substring(pos + 1).replaceAll("\r\n", " ").replaceAll("\n", " ");
            }
            const data = await req.text();
            if (data.length > FIELD_CONTENT_MAX_LENGTH) {
                return response(400);
            }
            if (emitEvent(uid, event, data)) {
                return response(200);
            }
        }
        return response(404);
    } else if (req.method.toUpperCase() === "GET") {
        if (path === "/" || path === "/index.html") {
            const f = await Deno.open("./index.html", { read: true });
            return new Response(f.readable, {
                headers: {
                    "Content-Type": "text/html",
                }
            });
        } else if (path.startsWith("/listen/")) {
            const uid = path.substring("/listen/".length);
            if (uid.length <= 0 || uid.indexOf("/") >= 0) {
                return response(400);
            }
            const resp = startListen(uid);
            if (resp) {
                return resp;
            }
            return response(409);
        }
        return response(404);
    } else if (req.method === "OPTIONS") {
        return new Response("200 OK", {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers"),
                "Access-Control-Max-Age": "86400",
            }
        });
    }
};

if (import.meta.main) {
    startKeepliveTask();
    const _server = Deno.serve({ port: PORT, hostname: "0.0.0.0" }, handler);
}
