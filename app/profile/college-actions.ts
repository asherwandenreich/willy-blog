"use server";

import { revalidatePath } from "next/cache";
import { adminSession } from "@/lib/admin";
import dbConnect from "@/lib/mongoose";
import College from "@/lib/CollegeModel";
import { STATUSES, type Status } from "@/lib/college";

// Admin only: edits to the college tracker on /profile?tab=college

async function admin() {
    if (!(await adminSession())) throw new Error("Unauthorized");
    await dbConnect();
}

const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v, 10)) ? str(v, 10) : "");
const url = (v: unknown) => (/^https?:\/\//i.test(str(v, 2000)) ? str(v, 2000) : ""); // no javascript: links
const refresh = () => revalidatePath("/profile");

export type CollegeFields = { name: string; plan: string; deadline: string; portal: string; link: string; notes: string };
export type TaskFields = { text: string; due: string; details: string; link: string };

function collegeFields(f: CollegeFields) {
    const name = str(f?.name, 200);
    if (!name) throw new Error("Name required");
    return { name, plan: str(f.plan, 100), deadline: day(f.deadline), portal: str(f.portal, 100), link: url(f.link), notes: str(f.notes) };
}

function taskFields(f: TaskFields) {
    const text = str(f?.text, 300);
    if (!text) throw new Error("Task required");
    return { text, due: day(f.due), details: str(f.details), link: url(f.link) };
}

export async function saveCollege(id: string | null, f: CollegeFields) {
    await admin();
    const fields = collegeFields(f);
    if (id) await College.updateOne({ _id: String(id) }, { $set: fields });
    else await College.create({ ...fields, order: await College.countDocuments() });
    refresh();
}

export async function setCollegeStatus(id: string, status: Status) {
    await admin();
    if (!STATUSES.includes(status)) throw new Error("Bad status");
    await College.updateOne({ _id: String(id) }, { $set: { status } });
    refresh();
}

export async function deleteCollege(id: string) {
    await admin();
    await College.deleteOne({ _id: String(id) });
    refresh();
}

export async function saveTask(collegeId: string, taskId: string | null, f: TaskFields) {
    await admin();
    const fields = taskFields(f);
    if (taskId) {
        const set = Object.fromEntries(Object.entries(fields).map(([k, v]) => [`tasks.$.${k}`, v]));
        await College.updateOne({ _id: String(collegeId), "tasks._id": String(taskId) }, { $set: set });
    } else {
        await College.updateOne({ _id: String(collegeId) }, { $push: { tasks: { ...fields, done: false } } });
    }
    refresh();
}

export async function setTaskDone(collegeId: string, taskId: string, done: boolean) {
    await admin();
    await College.updateOne({ _id: String(collegeId), "tasks._id": String(taskId) }, { $set: { "tasks.$.done": Boolean(done) } });
    refresh();
}

export async function deleteTask(collegeId: string, taskId: string) {
    await admin();
    await College.updateOne({ _id: String(collegeId) }, { $pull: { tasks: { _id: String(taskId) } } });
    refresh();
}
