import * as TF from '@tensorflow/tfjs'

export const tensorflowDemo = () => {
  return TF;
}

export const TFJS = async () => {
  // 创建模型
  const model = TF.sequential()
  model.add(TF.layers.dense({ units: 1, inputShape: [1] }))
  // 编译模型
  model.compile({ loss: 'meanSquaredError', optimizer: 'sgd' })
  // 训练模型
  const xs = TF.tensor2d([1, 2, 3, 4], [4, 1])
  const ys = TF.tensor2d([2, 4, 6, 8], [4, 1])
  model.fit(xs, ys, { epochs: 1000 })
  // 预测结果
  const result = model.predict(TF.tensor2d([5], [1, 1]))
  // 检查result的类型
  if (Array.isArray(result)) {
    result.forEach((tensor) => console.log(tensor.dataSync()))
  } else {
    console.log(result)
  }
  // 保存模型
  await model.save('localstorage://my-model')
  // 加载模型
  const loadedModel = await TF.loadLayersModel('localstorage://my-model')
  // 训练模型
  loadedModel.fit(xs, ys, { epochs: 1000 })

  // 预测结果
  const loadedResult = loadedModel.predict(TF.tensor2d([5], [1, 1]))
  // 检查loadedResult的类型
  if (Array.isArray(loadedResult)) {
    loadedResult.forEach((tensor) => console.log(tensor.dataSync()))
  } else {
    console.log(loadedResult)
  }
  // 关闭模型
  // await model.dispose()
}

class TFJSModel {
  private model: TF.Sequential

  constructor() {
    this.model = TF.sequential()
    // 训练模型
    const xs = TF.tensor2d([1, 2, 3, 4], [4, 1])
    const ys = TF.tensor2d([2, 4, 6, 8], [4, 1])
    this.model.fit(xs, ys, { epochs: 1000 })
  }

  /**
   * 创建模型
   * @returns <TF.Sequential> 模型
   */
  createModel(): TF.Sequential {
    this.model.add(TF.layers.dense({ inputShape: [784], units: 128, activation: 'relu' }))
    this.model.add(TF.layers.dropout({ rate: 0.2 }))
    this.model.add(TF.layers.dense({ units: 10, activation: 'softmax' }))

    // 编译模型
    this.model.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    })
    return this.model
  }
  
}

export default TFJSModel
