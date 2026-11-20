import { Schema, deleteModel, model, models } from "mongoose";

// Which vitamins were taken on one day of the calorie tracker (/calories): one document per day
const SupplementDaySchema = new Schema(
    {
        day: { type: String, required: true, unique: true }, // "YYYY-MM-DD" in California time (lib/calories.ts)
        taken: { type: [String], default: [] }, // SUPPLEMENTS ids from lib/calories.ts
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== "production" && models.SupplementDay) deleteModel("SupplementDay"); // see PostModel.ts
const SupplementDay = models.SupplementDay || model("SupplementDay", SupplementDaySchema);

export default SupplementDay;
