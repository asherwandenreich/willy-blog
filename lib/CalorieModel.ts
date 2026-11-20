import { Schema, deleteModel, model, models } from "mongoose";

// One thing eaten, logged on the calorie tracker (/calories)
const FoodEntrySchema = new Schema(
    {
        day: { type: String, required: true, index: true }, // "YYYY-MM-DD" in California time (lib/calories.ts)
        name: { type: String, required: true },
        calories: { type: Number, required: true, min: 0 },
        protein: { type: Number, min: 0 }, // grams, optional
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== "production" && models.FoodEntry) deleteModel("FoodEntry"); // see PostModel.ts
const FoodEntry = models.FoodEntry || model("FoodEntry", FoodEntrySchema);

export default FoodEntry;
