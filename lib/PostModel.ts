import { Schema, deleteModel, model, models } from "mongoose";

const PostSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
        },
        id: {
            type: String,
            required: true,
        },
        date: {
            type: Date,
            required: true,
        },
        content: {
            type: [String],
            required: true,
        },
        image: String, // id of the cover image (lib/ImageModel.ts), if it has one
        author: String, // who wrote it, shown beside the date (posts from before this have none: DEFAULT_AUTHOR)
    },
    { timestamps: true },
);

// In dev, hot reload keeps the previous version of the model in memory, so schema changes (like
// content becoming a list) wouldn't apply until a restart. Drop the old one and rebuild it.
if (process.env.NODE_ENV !== "production" && models.Post) deleteModel("Post");
const Post = models.Post || model("Post", PostSchema);

export default Post;

// The byline for posts saved before authors were recorded (all of them Willy's)
export const DEFAULT_AUTHOR = "Willy";
// The line under a post's title: its date, then who wrote it
export const byline = (post: { date: Date; author?: string }, month: "short" | "long") =>
    `${post.date.toLocaleDateString("en-US", { month, day: "numeric", year: "numeric" })} · by ${post.author || DEFAULT_AUTHOR}`;