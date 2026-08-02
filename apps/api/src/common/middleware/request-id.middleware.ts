export function RequestIdMiddleware(req: any, res: any, next: any) {
  req.id = req.headers['x-request-id'] ?? crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
