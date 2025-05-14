import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  socketId: { type: String },
  isOnline: { type: Boolean, default: false },
});

export default mongoose.model("User", userSchema);
