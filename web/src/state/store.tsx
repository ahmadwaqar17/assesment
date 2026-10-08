// React glue: the reducer in a context, saved to localStorage on every change.
import { useEffect, useReducer, type ReactNode } from 'react';
import { gateway } from '../payments';
import { resumePendingCharges } from './chargeFlow';
import { loadState, saveState } from './persistence';
import { reducer } from './reducer';
import { StoreContext } from './useStore';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Once, on load: finish any charge that was mid-flight when the page was closed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void resumePendingCharges(state, { gateway, dispatch }), []);

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}
