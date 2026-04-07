import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botStatusRouter from "./botStatus";
import marketStatusRouter from "./marketStatus";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botStatusRouter);
router.use(marketStatusRouter);

export default router;
