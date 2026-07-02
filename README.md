# Green Garden Business Suite v1.3 LTS - User Roles \& Branch Permissions

Built from verified v1.2.

New:

* Role-aware access control
* Branch restriction by user profile
* Branch Admin sees only assigned branch
* Viewer role is read-only
* Super Admin / Director / Finance can access all branches
* Menu hiding based on role
* Branch dropdown locked for branch-restricted users

Important:

1. Firebase Authentication creates login email/password.
2. GGBS User Management assigns role and branch access.
3. Super Admin fallback is enabled for thinagariy.pearanpan@gmail.com to prevent lockout.
4. Deployment retry 2s

