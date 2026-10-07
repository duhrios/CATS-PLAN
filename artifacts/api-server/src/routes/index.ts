import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reservationsRouter from "./reservations";
import pushRouter from "./push";
import authRouter from "./auth";
import staffAccountsRouter from "./staff-accounts";
import teacherAccountsRouter from "./teacher-accounts";
import roomsRouter from "./rooms";
import teacherSpreadsheetRouter from "./teacher-spreadsheet";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(staffAccountsRouter);
router.use(teacherAccountsRouter);
router.use(roomsRouter);
router.use(teacherSpreadsheetRouter);
router.use(reservationsRouter);
router.use(pushRouter);

export default router;
