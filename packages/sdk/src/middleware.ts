import { AgentPIConfig, resolveConfig } from './config';
import { createDiscoveryHandler } from './discovery';
import { createConnectHandler } from './connect';
import { createPrompt } from './prompt';

interface MiddlewareReq {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface MiddlewareRes {
  statusCode?: number;
  status?: (code: number) => MiddlewareRes;
  writeHead?: (code: number, headers?: Record<string, string>) => void;
  setHeader?: (name: string, value: string) => void;
  end?: (body: string) => void;
  send?: (body: unknown) => void;
  json?: (body: unknown) => void;
}

export function agentpi(config: AgentPIConfig) {
  const resolved = resolveConfig(config);
  const discoveryHandler = createDiscoveryHandler(resolved);
  const connectHandler = createConnectHandler(resolved);
  const prompt = config.baseUrl ? createPrompt(config.baseUrl) : null;

  return (req: MiddlewareReq, res: MiddlewareRes, next?: () => void) => {
    const url = (req.url || '').split('?')[0];
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'GET' && url === '/.well-known/agentpi.json') {
      const adapted = {
        send: (body: unknown) => {
          if (res.send) {
            res.send(body);
          } else if (res.writeHead && res.end) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
          }
        },
      };
      discoveryHandler(req, adapted);
      return;
    }

    if (method === 'POST' && url === resolved.connectEndpoint) {
      const adapted = {
        headers: req.headers,
        body: req.body,
      };
      const resAdapter = {
        status: (code: number) => {
          if (res.status) {
            res.status(code);
          } else {
            res.statusCode = code;
          }
          return resAdapter;
        },
        send: (body: unknown) => {
          if (res.send) {
            res.send(body);
          } else if (res.end) {
            if (res.setHeader) res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(body));
          }
        },
      };
      connectHandler(adapted, resAdapter);
      return;
    }

    if (prompt && next) {
      const origSend = res.send;
      const origJson = res.json;

      const inject = (body: unknown): unknown => {
        if (res.statusCode === 401 && body && typeof body === 'object') {
          return { ...(body as Record<string, unknown>), agentpi: prompt };
        }
        return body;
      };

      if (origSend) {
        res.send = function (body: unknown) {
          return origSend.call(this, inject(body));
        };
      }
      if (origJson) {
        res.json = function (body: unknown) {
          return origJson.call(this, inject(body));
        };
      }
    }

    if (next) next();
  };
}
