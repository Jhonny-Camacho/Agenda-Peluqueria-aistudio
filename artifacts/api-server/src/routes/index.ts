import { Router, type IRouter } from "express";
import healthRouter from "./health";
import salonRouter from "./salon";
import staffRouter from "./staff";

const router: IRouter = Router();

router.use(healthRouter);
router.use(salonRouter);
router.use(staffRouter);

export default router;
