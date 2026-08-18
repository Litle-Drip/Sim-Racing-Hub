import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import setupsRouter from "./setups";
import trackNotesRouter from "./trackNotes";
import trackDifficultyRouter from "./trackDifficulty";
import hardwareRouter from "./hardware";
import communityRouter from "./community";
import companionRouter from "./companion";
import rivalChallengesRouter from "./rivalChallenges";
import engineerUsageRouter from "./engineerUsage";
import friendsRouter from "./friends";
import leaguesRouter from "./leagues";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(setupsRouter);
router.use(trackNotesRouter);
router.use(trackDifficultyRouter);
router.use(hardwareRouter);
router.use(communityRouter);
router.use(companionRouter);
router.use(rivalChallengesRouter);
router.use(engineerUsageRouter);
router.use(friendsRouter);
router.use(leaguesRouter);

export default router;
