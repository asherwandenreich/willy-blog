import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError } from "better-auth/api";
import dbConnect from "./mongoose";
import { NAME_MAX } from "./names";

export const ADMIN_EMAILS = ["willvtran@gmail.com", "asherwandenreich@gmail.com"];

// Display names: trimmed, single-spaced, 1 to NAME_MAX characters. Checked here, where every sign-up and name change
// lands, so it holds however the name is sent (anyone can call the auth API directly, not just the site's forms).
function cleanName(name: unknown) {
    const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
    if (!n || n.length > NAME_MAX) throw new APIError("BAD_REQUEST", { message: `Names need 1 to ${NAME_MAX} characters` });
    return n;
}

export async function initAuth() {
    const mongooseInstance = await dbConnect();
    const client = mongooseInstance.connection.getClient();
    const instance = betterAuth({
        database: mongodbAdapter(client.db()),
        emailAndPassword: { enabled: true },
        // stay signed in on this browser for 30 days, renewed whenever you visit
        session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
        // Admin is decided by email and emails aren't verified, so nobody may sign up with an admin's email:
        // otherwise whoever registers it first becomes an admin. To add an admin, have them sign up first,
        // then put their email in ADMIN_EMAILS.
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        if (ADMIN_EMAILS.includes(user.email.toLowerCase())) return false;
                        return { data: { ...user, name: cleanName(user.name) } };
                    },
                },
                // other updates (a new password, say) don't touch the name
                update: { before: async (user) => (user.name === undefined ? undefined : { data: { ...user, name: cleanName(user.name) } }) },
            },
        },
});
    
        return instance;
    }