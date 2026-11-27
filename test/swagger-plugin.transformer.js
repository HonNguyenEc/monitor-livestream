// ts-jest needs name/version/factory; the Nest Swagger plugin only exports `before`.
const plugin = require('@nestjs/swagger/plugin');

module.exports.name = 'nestjs-swagger-plugin';
module.exports.version = 1;
module.exports.factory = (compiler) =>
  plugin.before({ introspectComments: true }, compiler.program);
