db = db.getSiblingDB('zdh');

db.createUser({
  user: 'zdh_user',
  pwd: 'zdh_password',
  roles: [
    {
      role: 'readWrite',
      db: 'zdh'
    }
  ]
});

db.createCollection('users');
db.createCollection('deployments');
db.createCollection('apps');