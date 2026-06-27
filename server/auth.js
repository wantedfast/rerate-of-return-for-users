import crypto from "node:crypto";

function extractToken(request) {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
}

export function createSessionStore() {
  const sessions = new Map();
  return {
    create(user) {
      const token = crypto.randomUUID();
      sessions.set(token, {
        username: user.username,
        role: user.role,
        personId: user.personId ?? null,
        displayName: user.displayName ?? user.username
      });
      return token;
    },
    get(token) {
      return token ? sessions.get(token) ?? null : null;
    },
    destroy(token) {
      if (token) {
        sessions.delete(token);
      }
    }
  };
}

export function requireAuth(sessionStore, requiredRole) {
  return (request, response, next) => {
    const session = sessionStore.get(extractToken(request));
    if (!session) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }
    if (requiredRole && session.role !== requiredRole) {
      response.status(403).json({ error: "Forbidden." });
      return;
    }
    request.session = session;
    request.token = extractToken(request);
    next();
  };
}

export function attachCurrentSession(sessionStore) {
  return (request, _response, next) => {
    request.session = sessionStore.get(extractToken(request));
    request.token = extractToken(request);
    next();
  };
}

