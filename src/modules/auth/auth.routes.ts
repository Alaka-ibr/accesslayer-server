import { Router } from 'express';
import {
   httpLogin,
   httpRegisterUserWithPassword,
   httpRefreshToken,
} from './auth.controllers';
import { httpStellarChallenge } from './stellar-challenge.controller';

const authRouter = Router();

authRouter.post('/challenge', httpStellarChallenge);
authRouter.post('/login', httpLogin);
authRouter.post('/register', httpRegisterUserWithPassword);
authRouter.post('/refresh', httpRefreshToken);

export default authRouter;
