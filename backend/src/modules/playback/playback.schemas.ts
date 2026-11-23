import { z } from "zod";

export const playbackIdParams = z.object({ id: z.uuid() });
