import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { boardUiSlice } from './boardUiSlice';

// One store for the interface state of the whole app. configureStore turns on the Redux
// DevTools browser extension (if installed) and, in development, checks that the state is
// never mutated outside a reducer and holds only plain serializable values
export const store = configureStore({
  reducer: {
    boardUi: boardUiSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks: components use these instead of the plain useSelector and useDispatch, so the
// state and the actions are checked against this store
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
