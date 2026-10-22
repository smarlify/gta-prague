import {createUserWithEmailAndPassword, signInWithEmailAndPassword} from 'firebase/auth';

export function authFailureMessage(error) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/missing-password':
    case 'auth/weak-password':
      return 'Use a password of at least 6 characters.';
    case 'auth/email-already-in-use':
      return 'That email already has an account. Sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password does not match.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/operation-not-allowed':
      return 'Email sign-in is not enabled yet.';
    default:
      return error?.message || 'Sign-in failed.';
  }
}

function credentials(email, password) {
  return [String(email || '').trim(), String(password || '')];
}

export async function signInWithEmail(auth, email, password) {
  const [address, secret] = credentials(email, password);
  const result = await signInWithEmailAndPassword(auth, address, secret);
  return result.user;
}

export async function createEmailAccount(auth, email, password) {
  const [address, secret] = credentials(email, password);
  const result = await createUserWithEmailAndPassword(auth, address, secret);
  return result.user;
}
