import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import process from "node:process";
import adminUsersHandler from "./api/admin-users.js";
import rosterHandler from "./api/roster.js";
import rosterMtdSalesHandler from "./api/roster-mtd-sales.js";

const API_HANDLERS = {
  "/api/admin-users": adminUsersHandler,
  "/api/roster": rosterHandler,
  "/api/roster-mtd-sales": rosterMtdSalesHandler,
};

function withExpressLikeResponse(res) {
  if (!res.status) {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
  }

  if (!res.send) {
    res.send = (payload) => {
      if (!res.writableEnded) {
        res.end(payload);
      }
      return res;
    };
  }

  return res;
}

async function readJsonBody(req) {
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") {
    return undefined;
  }

  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", resolve);
    req.on("error", reject);
  });

  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function localApiPlugin(env) {
  return {
    name: "local-api-routes",
    configureServer(server) {
      Object.entries(env).forEach(([key, value]) => {
        if (key.startsWith("FIREBASE_") && process.env[key] === undefined) {
          process.env[key] = value;
        }
      });

      server.middlewares.use(async (req, res, next) => {
        const requestUrl = req.url ? req.url.split("?")[0] : "";
        const handler = API_HANDLERS[requestUrl];

        if (!handler) {
          next();
          return;
        }

        try {
          req.body = await readJsonBody(req);
          await handler(req, withExpressLikeResponse(res));
        } catch (error) {
          console.error(`Local API route failed for ${requestUrl}`, error);
          withExpressLikeResponse(res)
            .status(error?.status || 500)
            .send(JSON.stringify({ error: error?.message || "Local API route failed." }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), localApiPlugin(env)],
  };
});
