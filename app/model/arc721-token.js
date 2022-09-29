module.exports = app => {
  const {CHAR} = app.Sequelize

  let ARC721Token = app.model.define('arc721_token', {
    contractAddress: {
      type: CHAR(20).BINARY,
      primaryKey: true
    },
    tokenId: {
      type: CHAR(32).BINARY,
      primaryKey: true
    },
    holder: CHAR(20).BINARY
  }, {freezeTableName: true, underscored: true, timestamps: false})

  ARC721Token.associate = () => {
    const {Contract} = app.model
    Contract.hasMany(ARC721Token, {as: 'arc721Tokens', foreignKey: 'contractAddress'})
    ARC721Token.belongsTo(Contract, {as: 'contract', foreignKey: 'contractAddress'})
  }

  return ARC721Token
}
