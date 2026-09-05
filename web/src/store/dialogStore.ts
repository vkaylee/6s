import { create } from "zustand";
import type { I18nObject } from "../types/index.ts";

export type DialogType = "alert" | "confirm";

export interface DialogOptions {
  title?: string | I18nObject;
  message: string | I18nObject;
  confirmText?: string | I18nObject;
  cancelText?: string | I18nObject;
  type?: DialogType;
  destructive?: boolean;
}

export interface DialogState {
  isOpen: boolean;
  options: DialogOptions;
  resolvePromise: ((value: boolean) => void) | null;
  showDialog: (options: DialogOptions) => Promise<boolean>;
  confirm: (
    message: string | I18nObject,
    title?: string | I18nObject,
    destructive?: boolean,
  ) => Promise<boolean>;
  alert: (message: string | I18nObject, title?: string | I18nObject) => Promise<void>;
  handleConfirm: () => void;
  handleCancel: () => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  isOpen: false,
  options: { message: "" },
  resolvePromise: null,

  showDialog: (options: DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        options,
        resolvePromise: resolve,
      });
    });
  },

  confirm: (message: string | I18nObject, title?: string | I18nObject, destructive = false) => {
    return get().showDialog({
      title,
      message,
      type: "confirm",
      destructive,
    });
  },

  alert: async (message: string | I18nObject, title?: string | I18nObject) => {
    await get().showDialog({
      title,
      message,
      type: "alert",
    });
  },

  handleConfirm: () => {
    const { resolvePromise } = get();
    if (resolvePromise) {
      resolvePromise(true);
    }
    set({ isOpen: false, resolvePromise: null });
  },

  handleCancel: () => {
    const { resolvePromise } = get();
    if (resolvePromise) {
      resolvePromise(false);
    }
    set({ isOpen: false, resolvePromise: null });
  },
}));

/**
 * Convenient standalone async helpers to replace window.alert and window.confirm
 */
export const modalDialog = {
  alert: (message: string | I18nObject, title?: string | I18nObject) =>
    useDialogStore.getState().alert(message, title),
  confirm: (message: string | I18nObject, title?: string | I18nObject, destructive?: boolean) =>
    useDialogStore.getState().confirm(message, title, destructive),
};
