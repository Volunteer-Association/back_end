import { ref, reactive, shallowReactive } from 'vue';
import { readResource } from '@/api/modules/crud';

// API调用状态接口
interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// 通用API调用组合式函数
export function useApi<T>() {
  const state = shallowReactive<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = async (apiCall: () => Promise<T>) => {
    state.loading = true;
    state.error = null;
    
    try {
      const result = await apiCall();
      state.data = result;
      return result;
    } catch (error: unknown) {
      state.error = error instanceof Error ? error.message : 'An error occurred';
      throw error;
    } finally {
      state.loading = false;
    }
  };

  return {
    state,
    execute,
  };
}

// 数据列表管理组合式函数
export function useListApi<T>() {
  const list = ref<T[]>([]);
  const pagination = reactive({
    page: 1,
    pageSize: 10,
    total: 0,
  });
  
  const { state, execute } = useApi<T[]>();

  const fetchList = async (
    resource: string,
    params?: Record<string, unknown>,
  ) => {
    return execute(() => 
      readResource<T>(resource, params)
    );
  };

  const refresh = async (
    resource: string,
    params?: Record<string, unknown>,
  ) => {
    const result = await fetchList(resource, params);
    if (result) {
      list.value = result;
    }
    return result;
  };

  return {
    list,
    pagination,
    state,
    fetchList,
    refresh,
  };
}

// 表单处理组合式函数
export function useForm<T>() {
  const form = ref<T>({} as T);
  const { state, execute } = useApi<unknown>();

  const submit = async (apiCall: (data: T) => Promise<unknown>) => {
    return execute(() => apiCall(form.value));
  };

  const reset = () => {
    form.value = {} as T;
  };

  return {
    form,
    state,
    submit,
    reset,
  };
}
