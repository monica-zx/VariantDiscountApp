import { createRequestHandler } from "@react-router/node";
import * as build from "../build/server/index.js";

const handler = createRequestHandler(build, process.env.NODE_ENV);

export default async function (req, res) {
  try {
    await handler(req, res);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
}