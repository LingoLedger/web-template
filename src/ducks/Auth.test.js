import { call, put, take, fork, cancel } from 'redux-saga/effects';
import { createMockTask } from 'redux-saga/utils';
import reducer, {
  LOGIN_REQUEST,
  LOGOUT_REQUEST,
  NOTHING_IN_PROGRESS,
  LOGIN_IN_PROGRESS,
  LOGOUT_IN_PROGRESS,
  authInfo,
  authInfoSuccess,
  authInfoError,
  login,
  loginSuccess,
  loginError,
  callLogin,
  logout,
  logoutSuccess,
  logoutError,
  callLogout,
  watchAuth,
} from './Auth.duck';

describe('Auth duck', () => {
  describe('reducer', () => {
    it('should be logged out by default', () => {
      const state = reducer();
      expect(state.authInfoLoaded).toEqual(false);
      expect(state.isAuthenticated).toEqual(false);
      expect(state.authInfoError).toBeNull();
      expect(state.loginError).toBeNull();
      expect(state.logoutError).toBeNull();
    });

    it('should login successfully', () => {
      const username = 'x@x.x';
      const password = 'pass';

      let state = reducer();
      state = reducer(state, login(username, password));
      expect(state.isAuthenticated).toEqual(false);
      expect(state.loginError).toBeNull();

      state = reducer(state, loginSuccess());
      expect(state.isAuthenticated).toEqual(true);
      expect(state.loginError).toBeNull();
    });

    it('should handle failed login', () => {
      let state = reducer();
      state = reducer(state, login('username', 'pass'));
      expect(state.isAuthenticated).toEqual(false);
      expect(state.loginError).toBeNull();

      const error = new Error('test error');
      state = reducer(state, loginError(error));
      expect(state.isAuthenticated).toEqual(false);
      expect(state.loginError).toEqual(error);
    });

    it('should set initial state for unauthenticated users', () => {
      const authInfoLoggedOut = {};
      const initialState = reducer();
      expect(initialState.authInfoLoaded).toEqual(false);
      const state = reducer(initialState, authInfoSuccess(authInfoLoggedOut));
      expect(state.authInfoLoaded).toEqual(true);
      expect(state.isAuthenticated).toEqual(false);
      expect(state.authInfoError).toBeNull();
    });

    it('should set initial state for anonymous users', () => {
      const authInfoAnonymous = { grantType: 'client_credentials' };
      const initialState = reducer();
      expect(initialState.authInfoLoaded).toEqual(false);
      const state = reducer(initialState, authInfoSuccess(authInfoAnonymous));
      expect(state.authInfoLoaded).toEqual(true);
      expect(state.isAuthenticated).toEqual(false);
      expect(state.authInfoError).toBeNull();
    });

    it('should set initial state for unauthenticated users', () => {
      const authInfoLoggedIn = { grantType: 'refresh_token' };
      const initialState = reducer();
      expect(initialState.authInfoLoaded).toEqual(false);
      const state = reducer(initialState, authInfoSuccess(authInfoLoggedIn));
      expect(state.authInfoLoaded).toEqual(true);
      expect(state.isAuthenticated).toEqual(true);
      expect(state.authInfoError).toBeNull();
    });
  });

  describe('login worker', () => {
    it('should succeed when API call fulfills', () => {
      const username = 'username';
      const password = 'pass';
      const payload = { username, password };
      const sdk = { login: jest.fn() };
      const loginAction = login(username, password);
      const worker = callLogin(loginAction, sdk);
      expect(worker.next()).toEqual({
        done: false,
        value: call(sdk.login, { username, password }),
      });
      expect(worker.next(payload)).toEqual({ done: false, value: put(loginSuccess()) });
      expect(worker.next().done).toEqual(true);
      expect(sdk.login).not.toHaveBeenCalled();
    });

    it('should fail when API call rejects', () => {
      const username = 'username';
      const password = 'pass';
      const sdk = { login: jest.fn() };
      const loginAction = login(username, password);
      const worker = callLogin(loginAction, sdk);
      expect(worker.next()).toEqual({
        done: false,
        value: call(sdk.login, { username, password }),
      });
      const error = new Error('Test login failed');
      expect(worker.throw(error)).toEqual({ done: false, value: put(loginError(error)) });
      expect(worker.next().done).toEqual(true);
      expect(sdk.login).not.toHaveBeenCalled();
    });
  });

  describe('logout worker', () => {
    it('should redirect to root after logout', () => {
      const sdk = { logout: jest.fn() };
      const historyPush = jest.fn();
      const action = logout(historyPush);
      const worker = callLogout(action, sdk);
      expect(worker.next()).toEqual({ done: false, value: call(sdk.logout) });
      expect(worker.next()).toEqual({ done: false, value: put(logoutSuccess()) });
      expect(worker.next()).toEqual({ done: false, value: call(historyPush, '/') });
      expect(worker.next().done).toEqual(true);
      expect(sdk.logout).not.toHaveBeenCalled();
      expect(historyPush).not.toHaveBeenCalled();
    });

    it('should not redirect if logout fails', () => {
      const sdk = { logout: jest.fn() };
      const historyPush = jest.fn();
      const action = logout(historyPush);
      const worker = callLogout(action, sdk);
      expect(worker.next()).toEqual({ done: false, value: call(sdk.logout) });
      const error = new Error('Test logout error');
      expect(worker.throw(error)).toEqual({ done: false, value: put(logoutError(error)) });
      expect(worker.next().done).toEqual(true);
      expect(sdk.logout).not.toHaveBeenCalled();
      expect(historyPush).not.toHaveBeenCalled();
    });
  });

  describe('auth watcher', () => {
    it('calls login', () => {
      const sdk = { login: jest.fn() };
      const watcher = watchAuth(sdk);
      const loginAction = login('username', 'password');
      const takeLoginOrLogout = take([LOGIN_REQUEST, LOGOUT_REQUEST]);
      const forkLogin = fork(callLogin, loginAction, sdk);

      // The watcher should first take a login or a logout action
      expect(watcher.next().value).toEqual(takeLoginOrLogout);

      // If we pass it a login action, it should fork the login worker
      expect(watcher.next(loginAction).value).toEqual(forkLogin);

      // It should continue back at taking a login or a logout action
      expect(watcher.next({}).value).toEqual(takeLoginOrLogout);

      expect(sdk.login).not.toHaveBeenCalled();
    });

    it('calls logout', () => {
      const sdk = { logout: jest.fn() };
      const historyPush = jest.fn();
      const watcher = watchAuth(sdk);
      const logoutAction = logout(historyPush);
      const takeLoginOrLogout = take([LOGIN_REQUEST, LOGOUT_REQUEST]);
      const forkLogout = fork(callLogout, logoutAction, sdk);

      // The watcher should first take a login or a logout action
      expect(watcher.next().value).toEqual(takeLoginOrLogout);

      // If we pass it a logout action, it should fork the logout worker
      expect(watcher.next(logoutAction).value).toEqual(forkLogout);

      // It should continue back at taking a login or a logout action
      expect(watcher.next().value).toEqual(takeLoginOrLogout);

      expect(sdk.logout).not.toHaveBeenCalled();
      expect(historyPush).not.toHaveBeenCalled();
    });

    it('should cancel login if another login comes', () => {
      const sdk = { login: jest.fn(), logout: jest.fn() };
      const watcher = watchAuth(sdk);
      const loginAction1 = login('username1', 'password1');
      const loginAction2 = login('username2', 'password2');
      const task = createMockTask();
      const takeLoginOrLogout = take([LOGIN_REQUEST, LOGOUT_REQUEST]);
      const forkLogin1 = fork(callLogin, loginAction1, sdk);
      const forkLogin2 = fork(callLogin, loginAction2, sdk);
      const cancelLogin1 = cancel(task);

      // First take a login or a logout
      expect(watcher.next().value).toEqual(takeLoginOrLogout);

      // Passing the first login should fork login worker
      expect(watcher.next(loginAction1).value).toEqual(forkLogin1);

      // Passing in the task to mock the fork results should make the
      // watcher take a login or a logout again
      expect(watcher.next(task).value).toEqual(takeLoginOrLogout);

      // Passing in another login should cancel the first fork task
      expect(watcher.next(loginAction2).value).toEqual(cancelLogin1);

      // Then it should fork the second login
      expect(watcher.next().value).toEqual(forkLogin2);

      // And finally take a login or a logout again
      expect(watcher.next().value).toEqual(takeLoginOrLogout);

      expect(sdk.login).not.toHaveBeenCalled();
      expect(sdk.logout).not.toHaveBeenCalled();
    });

    it('should cancel login if a logout comes', () => {
      const sdk = { login: jest.fn(), logout: jest.fn() };
      const historyPush = jest.fn();
      const watcher = watchAuth(sdk);
      const loginAction = login('username', 'password');
      const logoutAction = logout(historyPush);
      const task = createMockTask();
      const takeLoginOrLogout = take([LOGIN_REQUEST, LOGOUT_REQUEST]);
      const forkLogin = fork(callLogin, loginAction, sdk);
      const forkLogout = fork(callLogout, logoutAction, sdk);
      const cancelLogin = cancel(task);

      // First take a login or a logout
      expect(watcher.next().value).toEqual(takeLoginOrLogout);

      // Passing the login should fork login worker
      expect(watcher.next(loginAction).value).toEqual(forkLogin);

      // Passing in the task to mock the fork results should make the
      // watcher take a login or a logout again
      expect(watcher.next(task).value).toEqual(takeLoginOrLogout);

      // Passing in logout should cancel the login fork task
      expect(watcher.next(logoutAction).value).toEqual(cancelLogin);

      // Then it should fork the logout
      expect(watcher.next().value).toEqual(forkLogout);

      // And finally take a login or a logout again
      expect(watcher.next().value).toEqual(takeLoginOrLogout);

      expect(sdk.login).not.toHaveBeenCalled();
      expect(sdk.logout).not.toHaveBeenCalled();
      expect(historyPush).not.toHaveBeenCalled();
    });
  });
});