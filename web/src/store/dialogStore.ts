import { create } from "zustand";

export type DialogType = "alert" | "confirm";

export interface DialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: DialogType;
  destructive?: boolean;
}

export interface DialogState {
  isOpen: boolean;
  options: DialogOptions;
  resolvePromise: ((value: boolean) => void) | null;
  showDialog: (options: DialogOptions) => Promise<boolean>;
  confirm: (message: string, title?: string, destructive?: boolean) => Promise<boolean>;
  alert: (message: string, title?: string) => Promise<void>;
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

  confirm: (message: string, title?: string, destructive = false) => {
    return get().showDialog({
      title,
      message,
      type: "confirm",
      destructive,
      confirmText: "Đồng ý",
      cancelText: "Hủy",
    });
  },

  alert: async (message: string, title?: string) => {
    await get().showDialog({
      title,
      message,
      type: "alert",
      confirmText: "Đóng",
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
  alert: (message: string, title?: string) => useDialogStore.getState().alert(message, title),
  confirm: (message: string, title?: string, destructive?: boolean) =>
    useDialogStore.getState().confirm(message, title, destructive),
};
