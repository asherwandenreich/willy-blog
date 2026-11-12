import { Schema, deleteModel, model, models } from "mongoose";
import { STATUSES } from "./college";

// One school (or the "Every application" group) on the admin's college tracker, with its to-do list
const TaskSchema = new Schema({
    text: { type: String, required: true },
    due: String, // YYYY-MM-DD
    done: { type: Boolean, default: false },
    details: String,
    link: String,
});

const CollegeSchema = new Schema(
    {
        name: { type: String, required: true },
        plan: String,
        deadline: String, // YYYY-MM-DD
        portal: String,
        status: { type: String, enum: STATUSES, default: "applying" },
        link: String,
        notes: String,
        order: { type: Number, default: 0 },
        tasks: { type: [TaskSchema], default: [] },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== "production" && models.College) deleteModel("College"); // see PostModel.ts
const College = models.College || model("College", CollegeSchema);

export default College;
