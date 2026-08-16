import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { financeRouter } from "./routers/finance";

const localAccessInput = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,80}$/),
  password: z.string().min(10).max(200),
  displayName: z.string().trim().min(2).max(120),
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    localStatus: publicProcedure.query(() => db.getLocalAccessStatus()),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    users: router({
      list: adminProcedure.query(() => db.listLocalAccessUsers()),
      create: adminProcedure.input(localAccessInput.extend({ role: z.enum(["user", "admin"]).default("user") })).mutation(({ input }) => db.createLocalAccessUser(input)),
      update: adminProcedure.input(z.object({ id: z.number().int().positive(), password: z.string().min(10).max(200).optional(), isActive: z.boolean().optional() }).refine(input => input.password !== undefined || input.isActive !== undefined)).mutation(({ ctx, input }) => db.updateLocalAccessUser(ctx.user.id, { userId: input.id, password: input.password, isActive: input.isActive })),
    }),
  }),

  finance: financeRouter,

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
