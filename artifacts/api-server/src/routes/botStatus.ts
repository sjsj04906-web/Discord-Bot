import { Router, type IRouter } from "express";
import { client } from "../bot/client.js";
import { allCommands } from "../bot/commands/index.js";

const router: IRouter = Router();

router.get("/bot-status", (_req, res) => {
  const ready = client.isReady();
  const guilds = ready ? client.guilds.cache.size : 0;
  const members = ready ? client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0) : 0;
  const uptime = ready && client.uptime != null ? Math.floor(client.uptime / 1000) : 0;
  const latency = ready ? client.ws.ping : -1;

  res.json({
    online: ready,
    tag: ready ? client.user.tag : "GL1TCH#0000",
    guilds,
    members,
    commands: allCommands.length,
    uptime,
    latency,
    checkedAt: new Date().toISOString(),
  });
});

export default router;
