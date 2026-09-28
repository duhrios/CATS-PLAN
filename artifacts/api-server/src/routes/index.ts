import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reservationsRouter from "./reservations";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use(reservationsRouter);
router.use(pushRouter);

export default router;
