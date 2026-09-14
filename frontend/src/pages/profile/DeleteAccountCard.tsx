import React, { useState } from "react";
import { Trash2, X } from "lucide-react";
import * as api from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";

type Props = {
  /** The signed-in account's email; typing it back confirms the intent. */
  email: string;
  disabled: boolean;
  logout: () => void;
  onError: (message: string) => void;
};

export const DeleteAccountCard: React.FC<Props> = ({
  email,
  disabled,
  logout,
  onError,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const emailMatches =
    emailConfirmation.trim().toLowerCase() === email.trim().toLowerCase();

  const resetForm = () => {
    setIsOpen(false);
    setPassword("");
    setEmailConfirmation("");
  };

  const handleDelete = async () => {
    setShowConfirm(false);
    setLoading(true);
    onError("");
    try {
      await api.api.delete("/auth/account", {
        data: { currentPassword: password },
      });
      resetForm();
      logout();
    } catch (err: unknown) {
      let message = "Failed to delete account";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 border-2 border-rose-300 dark:border-rose-900 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-rose-50 dark:bg-rose-900/20 rounded-xl flex items-center justify-center border-2 border-rose-100 dark:border-rose-900">
          <Trash2 size={24} className="text-rose-600 dark:text-rose-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Delete Account
        </h2>
      </div>

      <p className="text-sm font-medium text-slate-600 dark:text-neutral-400 mb-4">
        Permanently deletes your account along with every drawing, collection
        and share that belongs to it. This cannot be undone.
      </p>

      {!isOpen ? (
        <button
          onClick={() => {
            onError("");
            setIsOpen(true);
          }}
          disabled={disabled}
          className="px-6 py-3 bg-rose-600 dark:bg-rose-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Trash2 size={18} />
          Delete My Account
        </button>
      ) : (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="deleteAccountPassword"
              className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2"
            >
              Current Password
            </label>
            <input
              id="deleteAccountPassword"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter current password"
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
            />
          </div>
          <div>
            <label
              htmlFor="deleteAccountEmail"
              className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2"
            >
              Type <span className="font-mono">{email}</span> to confirm
            </label>
            <input
              id="deleteAccountEmail"
              type="text"
              value={emailConfirmation}
              onChange={(event) => setEmailConfirmation(event.target.value)}
              placeholder={email}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={loading || !password || !emailMatches}
              className="flex-1 px-6 py-3 bg-rose-600 dark:bg-rose-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Deleting..." : "Delete Account Permanently"}
            </button>
            <button
              onClick={resetForm}
              disabled={loading}
              className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <X size={18} />
              Cancel
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showConfirm}
        title="Delete your account?"
        message="Every drawing, collection and share you own will be removed permanently. This cannot be undone."
        confirmText="Delete Permanently"
        onConfirm={() => void handleDelete()}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
};
