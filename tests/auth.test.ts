import { describe, expect, it } from 'vitest';
import { ADMIN, api, createAdmin, loginCookie, ORIGIN } from './helpers.js';

describe('auth', () => {
  it('rejects unauthenticated access to every protected resource', async () => {
    for (const path of ['/api/v1/doctors', '/api/v1/patients', '/api/v1/analytics/overview']) {
      const res = await api().get(path).expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('validates the login body', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'nope' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual([
      'email',
      'password',
    ]);
  });

  it('returns the same error for unknown email and wrong password', async () => {
    await createAdmin();
    const wrongPassword = await api()
      .post('/api/v1/auth/login')
      .send({ ...ADMIN, password: 'x' });
    const unknownUser = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'who@x.dev', password: 'x' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownUser.body);
  });

  it('sets an HttpOnly, SameSite=Lax session cookie on login', async () => {
    await createAdmin();
    const res = await api().post('/api/v1/auth/login').send(ADMIN).expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^ct_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body.data.user).toMatchObject({ email: ADMIN.email, role: 'admin' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('resolves the current user from the cookie and clears it on logout', async () => {
    const cookie = await loginCookie();
    const me = await api().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.data.user.email).toBe(ADMIN.email);

    const out = await api()
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .expect(204);
    expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(/ct_session=;/);
  });

  it('accepts a Bearer token for non-browser API clients', async () => {
    const cookie = await loginCookie();
    const token = cookie.split('=')[1]!;
    await api().get('/api/v1/doctors').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('rejects tampered tokens', async () => {
    const cookie = await loginCookie();
    await api()
      .get('/api/v1/doctors')
      .set('Cookie', `${cookie.slice(0, -2)}xx`)
      .expect(401);
  });

  it('blocks state-changing requests from foreign origins (CSRF)', async () => {
    const cookie = await loginCookie();
    const res = await api()
      .post('/api/v1/doctors')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
