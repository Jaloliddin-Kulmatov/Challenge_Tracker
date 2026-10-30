"use server";
import * as todos from "@/lib/services/todos";
import { run } from "./util";

// The to-do card keeps its own state, so these don't reload the page.
export const addTodoAction = async (raw: unknown) => run((ctx) => todos.addTodo(ctx, raw), { revalidate: false });
export const setTodoDoneAction = async (id: string, done: boolean) => run((ctx) => todos.setTodoDone(ctx, id, done), { revalidate: false });
export const deleteTodoAction = async (id: string) => run((ctx) => todos.deleteTodo(ctx, id), { revalidate: false });
