import { generateToken } from "./token.ts";

class AuthService {

    loginUser() {
        verifyPassword();
        generateToken();
    }
}

function verifyPassword() {
}