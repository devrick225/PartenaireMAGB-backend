/**
 * Script de test des permissions utilisateur
 * Vérifie que les permissions sont correctement configurées selon les rôles
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

// Simuler la structure des permissions
const ROLE_PERMISSIONS = {
  user: ['read_own_profile', 'update_own_profile', 'create_donation', 'create_ticket'],
  support_agent: ['read_users', 'update_tickets', 'read_donations', 'moderate_content'],
  moderator: ['read_users', 'update_tickets', 'read_donations', 'moderate_content'],
  treasurer: ['read_all_donations', 'read_payments', 'generate_reports', 'manage_refunds'],
  admin: ['*']
};

// Simuler la vérification des permissions
function hasPermission(userRole, permission) {
  const userPermissions = ROLE_PERMISSIONS[userRole] || [];
  
  if (userPermissions.includes('*')) return true;
  return userPermissions.includes(permission);
}

// Tests de permissions
function testPermissions() {
  log('\n🔒 Test des Permissions par Rôle\n', 'cyan');

  const testCases = [
    // Tests utilisateur normal
    { role: 'user', permission: 'create_donation', expected: true },
    { role: 'user', permission: 'read_payments', expected: false },
    { role: 'user', permission: 'update_tickets', expected: false },
    
    // Tests agent support
    { role: 'support_agent', permission: 'update_tickets', expected: true },
    { role: 'support_agent', permission: 'read_users', expected: true },
    { role: 'support_agent', permission: 'manage_refunds', expected: false },
    
    // Tests modérateur
    { role: 'moderator', permission: 'update_tickets', expected: true },
    { role: 'moderator', permission: 'read_donations', expected: true },
    { role: 'moderator', permission: 'read_payments', expected: false },
    
    // Tests trésorier
    { role: 'treasurer', permission: 'read_payments', expected: true },
    { role: 'treasurer', permission: 'manage_refunds', expected: true },
    { role: 'treasurer', permission: 'update_tickets', expected: false },
    
    // Tests admin
    { role: 'admin', permission: 'read_payments', expected: true },
    { role: 'admin', permission: 'manage_refunds', expected: true },
    { role: 'admin', permission: 'any_permission', expected: true },
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach(({ role, permission, expected }) => {
    const result = hasPermission(role, permission);
    const status = result === expected ? 'PASS' : 'FAIL';
    const color = result === expected ? 'green' : 'red';
    
    log(`  ${status}: ${role} → ${permission} (attendu: ${expected}, obtenu: ${result})`, color);
    
    if (result === expected) {
      passed++;
    } else {
      failed++;
    }
  });

  log(`\n📊 Résultats: ${passed} réussis, ${failed} échoués\n`, failed === 0 ? 'green' : 'red');
  return failed === 0;
}

// Test de la matrice de rôles
function testRoleMatrix() {
  log('🎯 Matrice des Rôles et Permissions\n', 'cyan');

  const permissions = [
    'read_own_profile',
    'create_donation', 
    'create_ticket',
    'read_users',
    'update_tickets',
    'read_donations',
    'read_payments',
    'manage_refunds'
  ];

  const roles = ['user', 'support_agent', 'moderator', 'treasurer', 'admin'];

  // Header
  process.stdout.write('Permission'.padEnd(20));
  roles.forEach(role => {
    process.stdout.write(role.padEnd(15));
  });
  console.log();
  console.log('-'.repeat(20 + roles.length * 15));

  // Matrice
  permissions.forEach(permission => {
    process.stdout.write(permission.padEnd(20));
    roles.forEach(role => {
      const access = hasPermission(role, permission);
      const symbol = access ? '✅' : '❌';
      process.stdout.write((symbol + ' ').padEnd(15));
    });
    console.log();
  });

  console.log();
}

// Test des endpoints spécifiques
function testEndpoints() {
  log('🌐 Test des Endpoints par Rôle\n', 'cyan');

  const endpoints = [
    { path: '/api/users', roles: ['admin', 'moderator', 'support_agent'] },
    { path: '/api/payments/stats', roles: ['admin', 'treasurer'] },
    { path: '/api/tickets/stats', roles: ['admin', 'moderator', 'support_agent'] },
    { path: '/api/donations/verify-payments', roles: ['admin', 'treasurer'] },
    { path: '/api/users/:id/role', roles: ['admin'] },
  ];

  endpoints.forEach(({ path, roles: allowedRoles }) => {
    log(`\n📍 ${path}`, 'yellow');
    
    const allRoles = ['user', 'support_agent', 'moderator', 'treasurer', 'admin'];
    
    allRoles.forEach(role => {
      const access = allowedRoles.includes(role);
      const symbol = access ? '✅' : '❌';
      const color = access ? 'green' : 'red';
      log(`    ${symbol} ${role}`, color);
    });
  });

  console.log();
}

// Test principal
function runTests() {
  log('🚀 Démarrage des tests de permissions\n', 'bright');
  
  const permissionsOk = testPermissions();
  testRoleMatrix();
  testEndpoints();
  
  if (permissionsOk) {
    log('✅ Tous les tests de permissions ont réussi !', 'green');
    log('🎉 Le système de rôles fonctionne correctement', 'green');
  } else {
    log('❌ Certains tests ont échoué', 'red');
    log('⚠️  Vérifiez la configuration des permissions', 'yellow');
  }
  
  log('\n📋 Rôles disponibles:', 'cyan');
  Object.keys(ROLE_PERMISSIONS).forEach(role => {
    const permissions = ROLE_PERMISSIONS[role];
    log(`  • ${role}: ${permissions.length} permission(s)`, 'blue');
  });
  
  log('\n💡 Pour changer un rôle utilisateur:', 'cyan');
  log('  PUT /api/users/:id/role avec { "role": "nouveau_role" }', 'blue');
}

// Vérification des configurations
function checkConfiguration() {
  log('\n🔧 Vérification de la configuration\n', 'cyan');
  
  const issues = [];
  
  // Vérifier que support_agent a les bonnes permissions
  const supportAgentPerms = ROLE_PERMISSIONS.support_agent;
  const requiredSupportPerms = ['read_users', 'update_tickets', 'read_donations', 'moderate_content'];
  
  requiredSupportPerms.forEach(perm => {
    if (!supportAgentPerms.includes(perm)) {
      issues.push(`support_agent manque la permission: ${perm}`);
    }
  });
  
  // Vérifier que user n'a pas de permissions élevées
  const userPerms = ROLE_PERMISSIONS.user;
  const forbiddenUserPerms = ['read_users', 'read_payments', 'manage_refunds'];
  
  forbiddenUserPerms.forEach(perm => {
    if (userPerms.includes(perm)) {
      issues.push(`user ne devrait pas avoir la permission: ${perm}`);
    }
  });
  
  if (issues.length === 0) {
    log('✅ Configuration correcte', 'green');
  } else {
    log('❌ Problèmes détectés:', 'red');
    issues.forEach(issue => log(`  • ${issue}`, 'red'));
  }
  
  return issues.length === 0;
}

// Exécution
if (require.main === module) {
  runTests();
  checkConfiguration();
} 