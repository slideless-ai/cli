import { Command } from 'commander';

import { signupRequestCommand } from './signup-request.js';
import { signupCompleteCommand } from './signup-complete.js';
import { loginRequestCommand } from './login-request.js';
import { loginCompleteCommand } from './login-complete.js';

export const authCommand = new Command('auth')
  .description('OTP-based signup and login for terminal / agent use');

authCommand.addCommand(signupRequestCommand);
authCommand.addCommand(signupCompleteCommand);
authCommand.addCommand(loginRequestCommand);
authCommand.addCommand(loginCompleteCommand);
