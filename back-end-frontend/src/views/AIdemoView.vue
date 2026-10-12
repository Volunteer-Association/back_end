<template>
    <div class="ai-demo">
        <h1>AI Demo</h1>
        <div class="ai-demo-content">
            <div class="ai-demo-left">sdfsdf</div>
            <div class="ai-demo-right">sdfsdf</div>
        </div>
        <div>
            <img width="500px" :src="teseai" alt="trainImages">
        </div>
    </div>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue';
import teseai from '../assets/images/aitext.jpg';
import * as TF from '@tensorflow/tfjs'

class LinearModel {
    model: TF.Sequential;
    constructor() {
        this.model = TF.sequential();
    }

    async loadModel(_xy: number[], _ys: number[]) {
        this.model.add(
            TF.layers.dense({
                inputShape: [1],
                units: 1
            })
        );

        this.model.compile({
            optimizer: 'sgd',
            loss: 'meanSquaredError',
        });

        this.model.fit(TF.tensor2d([2]), TF.tensor2d([4]), {
            epochs: 1000,
            batchSize: 32,
        })


    }

    predict(input: number[]) {
        console.log(input);
        const prediction = this.model.predict(TF.tensor2d([input], [1, input.length])); // 确保输入是一个2D数组
        if (Array.isArray(prediction)) {
            // 如果prediction是一个数组，遍历并同步提取每个Tensor的数据
            return prediction.map(tensor => Array.from(tensor.dataSync()));
        } else {
            // 如果prediction是一个单个的Tensor
            return prediction ? Array.from(prediction.dataSync()) : [];
        }
    }

    async save() {
        await this.model.save('localstorage://my-model');
        console.log('Model saved');
    }

}



onMounted(() => {
    const linearModel = new LinearModel();
    linearModel.loadModel([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
    console.log(linearModel.predict([10]));
    linearModel.save();
})

</script>

<style lang="css">
body {
    background-color: white;
}

</style>