import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import setupsRouter from "./setups";
import trackNotesRouter from "./trackNotes";
import hardwareRouter from "./hardware";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(setupsRouter);
router.use(trackNotesRouter);
router.use(hardwareRouter);

export default router;
