import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import setupsRouter from "./setups";
import trackNotesRouter from "./trackNotes";
import trackDifficultyRouter from "./trackDifficulty";
import hardwareRouter from "./hardware";
import communityRouter from "./community";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(setupsRouter);
router.use(trackNotesRouter);
router.use(trackDifficultyRouter);
router.use(hardwareRouter);
router.use(communityRouter);

export default router;
