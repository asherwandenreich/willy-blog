import { Schema, deleteModel, model, models } from "mongoose";

// One thing on the admin's shopping list (/profile?tab=shopping)
const ShoppingItemSchema = new Schema(
    {
        text: { type: String, required: true },
        price: Number, // in cents (lib/shopping.ts)
        link: String,
        done: { type: Boolean, default: false },
        doneAt: Date, // when it was checked off, so the newest checked item sits at the top of "Checked off"
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== "production" && models.ShoppingItem) deleteModel("ShoppingItem"); // see PostModel.ts
const ShoppingItem = models.ShoppingItem || model("ShoppingItem", ShoppingItemSchema);

export default ShoppingItem;
