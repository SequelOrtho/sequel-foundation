"use client";

import { useEffect, useRef, useState } from "react";

// "Arm, then Confirm" without losing keyboard focus (UX audit 2026-10-21,
// FND-21). A commitment action (Approve, Delete Team, Mark All Entered) often
// swaps its button for Confirm / Cancel; the button that had focus vanishes
// and focus falls to <body>. Put `confirmRef` on the Confirm button and
// `armRef` on the arming button: arming focuses Confirm, Cancel (or Escape on
// either) puts focus back on the arming button.
//
//   const step = useConfirmStep();
//   {step.armed
//     ? <><Button ref={step.confirmRef} onClick={approve}>Confirm Approve</Button>
//         <Button variant="outline" onClick={step.cancel}>Cancel</Button></>
//     : <Button ref={step.armRef} onClick={step.arm}>Approve</Button>}

export function useConfirmStep<A extends HTMLElement = HTMLButtonElement, C extends HTMLElement = HTMLButtonElement>() {
  const [armed, setArmed] = useState(false);
  const armRef = useRef<A>(null);
  const confirmRef = useRef<C>(null);
  const moved = useRef(false); // only move focus after a user's arm / cancel

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    (armed ? confirmRef : armRef).current?.focus();
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        moved.current = true;
        setArmed(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [armed]);

  return {
    armed,
    arm: () => {
      moved.current = true;
      setArmed(true);
    },
    cancel: () => {
      moved.current = true;
      setArmed(false);
    },
    /** After the action ran: back to the unarmed state without moving focus. */
    reset: () => setArmed(false),
    armRef,
    confirmRef,
  };
}
