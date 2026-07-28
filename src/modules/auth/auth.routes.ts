import { Router } from 'express';
import {
   httpLogin,
   httpRegisterUserWithPassword,
   httpRefreshToken,
} from './auth.controllers';

const authRouter = Router();

authRouter.post('/login', httpLogin);
authRouter.post('/register', httpRegisterUserWithPassword);
authRouter.post('/refresh', httpRefreshToken);

export default authRouter;
