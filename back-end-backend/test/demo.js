let num = 0;
function quer() {
    // quer()
    const timess = setTimeout(quer, 0)
    num++
    if (num == 1000) {
        // return 0;
        // clearTimeout(timess)
        return num;
    }
    console.log("执行", num)
}
quer()