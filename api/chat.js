/**
 * POST /api/chat — Screen Armors website AI assistant.
 * Supports conversational estimate lead capture via OpenAI tool calling + Resend.
 */

import { generateChatReply, MAX_USER_MESSAGE_LENGTH } from "./lib/screen-armors-ai.js";

function json(res, status, body) {
  return res
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .send(JSON.stringify(body));
}

function getString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, {
      success: false,
      message: "Method not allowed. Use POST.",
    });
  }

  const body = parseJsonBody(req);
  if (!body) {
    return json(res, 400, {
      success: false,
      message: "Invalid JSON body.",
    });
  }

  if (typeof body.message !== "string") {
    return json(res, 400, {
      success: false,
      message: "Please provide a text message.",
    });
  }

  const message = getString(body.message);
  if (!message) {
    return json(res, 400, {
      success: false,
      message: "Please enter a message.",
    });
  }

  if (message.length > MAX_USER_MESSAGE_LENGTH) {
    return json(res, 400, {
      success: false,
      message: "That message is too long. Please keep it under 2000 characters.",
    });
  }

  const history = Array.isArray(body.history) ? body.history : undefined;
  const currentPath =
    typeof body.currentPath === "string" ? getString(body.currentPath) : "";
  const leadAlreadySubmitted = body.leadSubmitted === true;

  try {
    const result = await generateChatReply({
      message,
      history,
      currentPath,
      leadAlreadySubmitted,
    });

    if (!result.ok) {
      return json(res, result.status || 500, {
        success: false,
        message: result.message,
      });
    }

    return json(res, 200, {
      success: true,
      message: result.message,
      ...(result.leadSubmitted ? { leadSubmitted: true } : {}),
      ...(Array.isArray(result.links) && result.links.length
        ? { links: result.links }
        : {}),
    });
  } catch (err) {
    console.error("[api/chat] Unexpected error", {
      name: err?.name,
      message: err?.message,
    });
    return json(res, 500, {
      success: false,
      message:
        "Sorry — something went wrong on our side. Please try again later or call (941) 404-9699.",
    });
  }
}
