// Turns a Firebase sign-in error code into a message people can act on.
// A wrong email and a wrong password get the same message, so nobody can find out which emails have a login.
export function describeLoginError(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password. Check both and try again.';
    case 'auth/invalid-email':
      return 'That doesn’t look like an email address (for example name@velvo.in).';
    case 'auth/user-disabled':
      return 'Your access has been removed. Ask an admin if you think this is a mistake.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes and try again, or ask an admin to reset your password.';
    case 'auth/network-request-failed':
      return 'Couldn’t reach the server. Check your internet connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Signing in with a password isn’t switched on yet. Please tell your admin.';
    case 'auth/web-storage-unsupported':
      return 'This browser can’t keep you signed in (for example in private mode or an in-app browser). Try Chrome, Edge or Safari.';
    case 'app/no-app':
      return 'Sign-in isn’t available right now because the app couldn’t load its settings. Reload the page and try again.';
    default:
      return 'Sign-in didn’t work. Please try again.';
  }
}

// The same for changing a password.
export function describePasswordChangeError(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
      return 'Your current password is not right. Check it and try again.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'That password is too easy to guess. Choose a longer one.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Couldn’t reach the server. Check your internet connection and try again.';
    case 'auth/requires-recent-login':
    case 'auth/user-token-expired':
    case 'auth/user-disabled':
      return 'Please sign out, sign in again, and then change your password.';
    default:
      return 'Your password could not be changed. Please try again.';
  }
}
